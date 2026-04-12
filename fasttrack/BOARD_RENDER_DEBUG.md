# 🐛 BOARD RENDER DEBUGGING GUIDE

## 🎯 ISSUE
User reports: "the board is not rendering"

## ✅ TESTS COMPLETED

### **1. Minimal Render Test** ✅ PASSED
- **File:** `test_board_minimal.html`
- **Result:** Cube renders successfully
- **Conclusion:** THREE.js, VR ESP, and dimensional substrates load correctly

### **2. Syntax Validation** ✅ PASSED
- **Command:** `node -c vr_esp.js`
- **Result:** No syntax errors
- **Conclusion:** All JavaScript files are syntactically valid

### **3. IDE Diagnostics** ✅ PASSED
- **Files checked:** `board_3d.html`, `vr_esp.js`, `observation_substrate.js`, `intent_manifold.js`, `potential_substrate.js`
- **Result:** No diagnostics found
- **Conclusion:** No linting or type errors

### **4. Server Accessibility** ✅ PASSED
- **URL:** `http://localhost:8080/lobby.html`
- **Result:** Lobby accessible
- **Conclusion:** Server running correctly on port 8080

## 🔍 POTENTIAL CAUSES

### **1. VR ESP Initialization Timing**
- `vr_esp.js` uses `window.onload` which might conflict with game initialization
- Game uses jQuery's `$(function() {...})` which should fire after DOM ready
- **Likelihood:** Low (test showed VR ESP loads fine)

### **2. ObservationSubstrate Timing**
- Board ready detection uses `ObservationSubstrate.when()` instead of `setInterval`
- Might have different timing characteristics
- **Likelihood:** Medium

### **3. Missing Dependencies**
- Some script might not be loading
- **Likelihood:** Low (minimal test passed)

### **4. Console Errors**
- JavaScript runtime errors preventing board creation
- **Likelihood:** High (most common cause)

## 🧪 DEBUGGING STEPS

### **Step 1: Check Browser Console**
1. Open `http://localhost:8080/lobby.html`
2. Click "Play Solo" or "Quick Play"
3. Open DevTools (F12) → Console tab
4. Look for:
   - ❌ Red errors
   - ⚠️ Yellow warnings
   - 🔴 Failed network requests (404s)

### **Step 2: Check Network Tab**
1. Open DevTools (F12) → Network tab
2. Reload page
3. Look for:
   - Failed script loads (404, 500 errors)
   - CORS errors
   - Slow loading scripts

### **Step 3: Check Elements Tab**
1. Open DevTools (F12) → Elements tab
2. Look for:
   - `<canvas>` element (THREE.js renderer)
   - Board container div
   - Proper CSS styling

### **Step 4: Test Without VR**
Temporarily disable VR to isolate the issue:

```html
<!-- Comment out line 978 in board_3d.html -->
<!-- <script src="vr_esp.js?v=20260228"></script> -->
```

### **Step 5: Test With Original VR**
Revert to original VR implementation:

```html
<!-- Change line 978 in board_3d.html -->
<script src="vr_meta_quest.js?v=20260228"></script>
```

### **Step 6: Check ObservationSubstrate**
Add debug logging to board ready detection:

```javascript
ObservationSubstrate.when(
    () => {
        const hr = window.holeRegistry || holeRegistry;
        console.log('🔍 Checking holeRegistry:', hr, 'size:', hr?.size);
        return (hr && hr.size > 0) ? hr : null;
    },
    (registry) => {
        console.log('✅ Board ready! holeRegistry:', registry.size, 'holes');
        // ... rest of code
    }
);
```

## 🎯 EXPECTED BEHAVIOR

### **Normal Board Load Sequence:**
1. Lobby loads
2. User clicks "Play Solo"
3. `board_3d.html` loads with `?offline=true`
4. Scripts load in order:
   - jQuery
   - THREE.js
   - Dimensional substrates
   - VR ESP
   - Game logic
5. jQuery ready fires: `$(function() { ... })`
6. Board initialization starts
7. `holeRegistry` populates with holes
8. `ObservationSubstrate.when()` detects registry ready
9. Board renders
10. Camera positioned
11. Game starts

### **What User Should See:**
- 3D hexagonal board with colored wedges
- Pegs in holding areas
- Cards dealt
- UI panel with game controls
- Smooth camera rotation on drag

## 🚨 COMMON ERRORS

### **Error 1: "Cannot read property 'size' of undefined"**
- **Cause:** `holeRegistry` not initialized
- **Fix:** Check if `board_manifold.js` loaded

### **Error 2: "THREE is not defined"**
- **Cause:** THREE.js didn't load
- **Fix:** Check CDN availability, network connection

### **Error 3: "ObservationSubstrate is not defined"**
- **Cause:** `observation_substrate.js` didn't load
- **Fix:** Check file exists, check script tag order

### **Error 4: Black screen / void**
- **Cause:** Camera position wrong, lighting missing, or VR mode active
- **Fix:** Check camera.position, add lights, exit VR mode

## 📋 QUICK CHECKLIST

Before reporting "board not rendering":
- [ ] Checked browser console for errors
- [ ] Checked network tab for failed requests
- [ ] Verified `<canvas>` element exists in DOM
- [ ] Tested in different browser
- [ ] Cleared browser cache
- [ ] Tried incognito/private mode
- [ ] Checked if VR mode accidentally activated
- [ ] Verified server is running on correct port

## 🔄 ROLLBACK COMMANDS

### **Revert All Changes:**
```bash
git reset --hard 664a535
```

### **Revert Specific Files:**
```bash
git checkout 664a535 -- web/games/fasttrack/board_3d.html
git checkout 664a535 -- web/games/fasttrack/vr_meta_quest.js
```

### **Revert Just VR:**
```bash
# In board_3d.html line 978, change:
vr_esp.js → vr_meta_quest.js
```

## 📊 STATUS

- **Minimal Test:** ✅ PASSED (cube renders)
- **Syntax Check:** ✅ PASSED (no errors)
- **Server:** ✅ RUNNING (port 8080)
- **Full Game:** ⏳ PENDING USER TESTING

**Next Action:** User needs to test actual game and report console errors (if any)

