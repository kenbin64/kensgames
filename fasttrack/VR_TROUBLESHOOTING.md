# 🥽 VR TROUBLESHOOTING GUIDE
## Fixing the "Void" Issue in Meta Quest

---

## 🔴 **PROBLEM: Black Screen / Void in VR**

When you enter VR mode, you see only blackness or a void instead of the game board.

---

## ✅ **SOLUTIONS:**

### **Solution 1: Check HTTPS (Most Common)**

WebXR **requires HTTPS**. HTTP will not work!

#### **Test:**
```bash
# Check your URL - must start with https://
https://your-domain.com/games/fasttrack/board_3d.html  ✅ GOOD
http://your-domain.com/games/fasttrack/board_3d.html   ❌ BAD
```

#### **Fix:**
```bash
# Option A: Use ngrok for local testing
cd /opt/butterflyfx/dimensionsos/web/games/fasttrack
./start_vr_server.sh

# Option B: Deploy with SSL
cd /opt/butterflyfx/dimensionsos/deploy
./setup-ssl-ttlrecall.sh
```

---

### **Solution 2: Refresh After Entering VR**

Sometimes the scene needs a refresh after VR mode starts.

#### **Steps:**
1. Click "🥽 Enter VR" button
2. Put on headset
3. If you see void, **press the Oculus button**
4. **Exit and re-enter the browser**
5. Scene should now be visible

---

### **Solution 3: Check Browser Console**

#### **On Desktop (before entering VR):**
1. Press **F12** to open developer tools
2. Click **Console** tab
3. Look for errors related to:
   - `WebXR`
   - `renderer.xr`
   - `setAnimationLoop`
   - `THREE.WebGLRenderer`

#### **Common Errors:**

**Error:** `WebXR not supported`
- **Fix:** Use Meta Quest Browser (not Chrome/Firefox on Quest)

**Error:** `SecurityError: WebXR requires HTTPS`
- **Fix:** Use HTTPS (see Solution 1)

**Error:** `renderer.xr is undefined`
- **Fix:** Update Three.js version (need r128+)

---

### **Solution 4: Update Three.js**

The game needs Three.js r128 or newer for WebXR support.

#### **Check Version:**
Open browser console and type:
```javascript
THREE.REVISION
```

Should show: `128` or higher

#### **Fix if Outdated:**
Edit `board_3d.html` line ~927:
```html
<!-- Update to latest -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r150/three.min.js"></script>
```

---

### **Solution 5: Disable OrbitControls in VR**

OrbitControls can interfere with VR camera.

#### **Check:**
Look in browser console for:
```
OrbitControls: Camera is being controlled by VR
```

#### **Fix:**
The code should automatically disable OrbitControls in VR mode.
If not, add this to `vr_meta_quest.js`:

```javascript
async enterVR() {
    // ... existing code ...
    
    // Disable OrbitControls in VR
    if (window.controls) {
        window.controls.enabled = false;
    }
}
```

---

### **Solution 6: Check Scene Background**

If background is black (0x000000), it looks like void.

#### **Fix:**
Change scene background to something visible:

```javascript
// In board_3d.html init() function
scene.background = new THREE.Color(0x0a0a14); // Dark blue
// OR
scene.background = new THREE.Color(0x1a1a2e); // Lighter
```

---

### **Solution 7: Add Grid Helper (Debug)**

Add a visible grid to confirm VR is working.

#### **Temporary Debug Code:**
Add to `vr_meta_quest.js` in `enterVR()`:

```javascript
// Add visible grid for debugging
const gridHelper = new THREE.GridHelper(100, 20, 0x00ff00, 0x00ff00);
gridHelper.position.y = -50;
window.scene.add(gridHelper);
console.log('✅ Debug grid added');
```

If you see the green grid in VR, the problem is with the board visibility, not VR itself.

---

### **Solution 8: Check Camera Position**

Camera might be inside an object or too far away.

#### **Debug:**
Add to browser console:
```javascript
console.log('Camera position:', camera.position);
console.log('Camera looking at:', controls.target);
```

#### **Fix:**
Reset camera position:
```javascript
camera.position.set(0, 300, 500);
camera.lookAt(0, 0, 0);
```

---

### **Solution 9: Increase Lighting**

Scene might be too dark to see.

#### **Fix:**
The VR code now adds extra lighting automatically.
If still dark, increase ambient light:

```javascript
// In enhanceVRLighting()
const vrAmbient = new THREE.AmbientLight(0xffffff, 1.5); // Increase from 0.8
```

---

### **Solution 10: Check Renderer Settings**

#### **Verify:**
```javascript
console.log('Renderer XR enabled:', renderer.xr.enabled);
console.log('Renderer size:', renderer.getSize(new THREE.Vector2()));
```

Should show:
```
Renderer XR enabled: true
Renderer size: Vector2 {x: 1920, y: 1080}
```

#### **Fix if False:**
```javascript
renderer.xr.enabled = true;
```

---

## 🧪 **TESTING CHECKLIST:**

Before entering VR, verify:

- [ ] URL starts with `https://`
- [ ] Browser console shows no errors
- [ ] Three.js version is r128+
- [ ] Scene has objects (check `scene.children.length > 0`)
- [ ] Camera position is reasonable (not at 0,0,0)
- [ ] Lighting exists (check `scene.children` for lights)
- [ ] Renderer XR is enabled (`renderer.xr.enabled === true`)
- [ ] VR button appeared (means WebXR is supported)

---

## 🔍 **DIAGNOSTIC COMMANDS:**

Run these in browser console (F12) **before** entering VR:

```javascript
// Check scene
console.log('Scene children:', scene.children.length);
console.log('Board group:', boardGroup.children.length);

// Check camera
console.log('Camera:', camera.position);

// Check renderer
console.log('XR enabled:', renderer.xr.enabled);

// Check WebXR support
navigator.xr.isSessionSupported('immersive-vr').then(supported => {
    console.log('VR supported:', supported);
});

// List all lights
scene.children.filter(c => c.isLight).forEach(light => {
    console.log('Light:', light.type, light.intensity);
});
```

---

## 📱 **QUEST-SPECIFIC FIXES:**

### **Quest Browser Settings:**
1. Open Quest Browser settings
2. Enable **WebXR**
3. Enable **JavaScript**
4. Clear cache and cookies
5. Restart browser

### **Quest System Settings:**
1. Go to **Settings** → **System**
2. Check **Software Update** (update if available)
3. Go to **Experimental Features**
4. Enable **Developer Mode** (if testing)

---

## 🆘 **STILL NOT WORKING?**

### **Last Resort:**

1. **Restart Quest headset** completely
2. **Clear browser cache** in Quest Browser
3. **Try different browser** (if available)
4. **Test on desktop first** (non-VR mode)
5. **Check server logs** for errors

### **Report Issue:**

If still broken, collect this info:
- Quest model (2/3/Pro)
- Browser version
- URL you're using (http vs https)
- Browser console errors
- Server logs

---

## ✅ **EXPECTED BEHAVIOR:**

When VR works correctly:

1. Click "🥽 Enter VR" button
2. Browser asks for VR permission → **Allow**
3. Screen goes black briefly (1-2 seconds)
4. **You see the game board** in 3D space
5. Controllers appear as blue rays
6. You can look around 360°
7. Board is visible below/in front of you

---

**If you see the board, VR is working! 🎉**

If you still see void, try the solutions above in order.

