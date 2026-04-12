# 🥽 META QUEST VR SETUP GUIDE
## Play FastTrack in Virtual Reality

---

## 🎮 **COMPATIBLE DEVICES**

✅ **Meta Quest 3** (Recommended - has hand tracking)  
✅ **Meta Quest 2**  
✅ **Meta Quest Pro**  
⚠️ **Meta Quest 1** (may work but not tested)

---

## 📋 **REQUIREMENTS**

### **Hardware:**
- Meta Quest headset (fully charged)
- Stable WiFi connection
- Room-scale play area (2m x 2m minimum)

### **Software:**
- Latest Meta Quest firmware
- Meta Quest Browser (pre-installed)
- WebXR support enabled (default on Quest)

---

## 🚀 **HOW TO PLAY**

### **Step 1: Access the Game**

#### **Option A: Direct URL (Easiest)**
1. Put on your Meta Quest headset
2. Open **Meta Quest Browser**
3. Navigate to your game URL:
   ```
   http://your-server-ip:8000/games/fasttrack/board_3d.html
   ```
   Or if deployed:
   ```
   https://yourdomain.com/games/fasttrack/board_3d.html
   ```

#### **Option B: Bookmark**
1. Visit the game URL on your Quest browser
2. Bookmark it for easy access
3. Access from bookmarks menu

#### **Option C: QR Code**
1. Generate QR code for your game URL
2. Use Quest's camera to scan QR code
3. Opens directly in browser

---

### **Step 2: Enter VR Mode**

1. **Wait for game to load** - You'll see the 3D board
2. **Look for VR button** - Bottom right corner: "🥽 Enter VR"
3. **Click the button** - Use controller or hand tracking
4. **Allow VR permissions** - Browser will ask for VR access
5. **Put on headset** - You're now in VR!

---

### **Step 3: VR Controls**

#### **🎮 Controller Controls:**

**Left Controller:**
- **Trigger** - Select pieces/holes
- **Grip** - Teleport mode
- **Thumbstick** - Rotate view

**Right Controller:**
- **Trigger** - Select cards/actions
- **Grip** - Teleport mode
- **Thumbstick** - Rotate view

#### **👋 Hand Tracking (Quest 3):**
- **Pinch** - Select objects
- **Point** - Aim at targets
- **Grab gesture** - Pick up cards

#### **🚶 Movement:**
1. **Squeeze grip button** on either controller
2. **Point where you want to go** - Blue circle appears
3. **Release grip** - Teleport to location
4. **Walk naturally** - Room-scale tracking

---

### **Step 4: Gameplay in VR**

#### **Viewing the Board:**
- **Walk around** the board in 360°
- **Lean in** to see details
- **Look up** to see cosmic VR theme
- **Point controllers** to highlight pieces

#### **Making Moves:**
1. **Point at your piece** with controller
2. **Pull trigger** to select
3. **Point at destination hole**
4. **Pull trigger** to move

#### **Drawing Cards:**
- **Point at deck** (floating in space)
- **Pull trigger** to draw
- **Card appears** in 3D space

#### **UI Interaction:**
- **3D floating menus** appear near you
- **Point and click** with trigger
- **Menus follow** your gaze

---

## 🎨 **VR THEME**

The game automatically switches to **VR Immersive Theme** when you enter VR:

- **360° Cosmic Environment** - Fractal universe, nebulas, galaxies
- **Dynamic Scenes** - Changes every 2 minutes
- **Spatial Audio** - Procedural ambient soundscapes
- **Immersive Lighting** - Volumetric effects
- **Particle Systems** - Stars, dust, energy fields

---

## ⚙️ **SETTINGS & OPTIMIZATION**

### **Performance Settings:**

If experiencing lag:
1. **Lower graphics quality** in game settings
2. **Disable shadows** for better FPS
3. **Reduce particle effects**
4. **Close other browser tabs**

### **Comfort Settings:**

- **Teleport movement** - Reduces motion sickness
- **Snap turning** - Rotate in 45° increments
- **Vignette effect** - Reduces peripheral vision during movement

---

## 🐛 **TROUBLESHOOTING**

### **"VR Not Supported" Message**

**Solution:**
- Make sure you're using **Meta Quest Browser** (not Chrome/Firefox)
- Update Quest firmware to latest version
- Try restarting the headset

### **VR Button Not Appearing**

**Solution:**
- Refresh the page
- Check browser console for errors (F12)
- Ensure HTTPS is used (required for WebXR)

### **Controllers Not Working**

**Solution:**
- Check controller batteries
- Re-pair controllers in Quest settings
- Restart the headset

### **Hand Tracking Not Working**

**Solution:**
- Enable hand tracking in Quest settings
- Put controllers down
- Ensure good lighting in room
- Quest 3 only feature

### **Performance Issues**

**Solution:**
- Close other apps on Quest
- Lower graphics settings
- Ensure strong WiFi signal
- Restart browser

---

## 🌐 **HTTPS REQUIREMENT**

WebXR **requires HTTPS** for security. Options:

### **Local Development:**
```bash
# Use ngrok for HTTPS tunnel
ngrok http 8000
```

### **Production:**
- Use Let's Encrypt SSL (free)
- Deploy with HTTPS enabled
- See `/deploy/setup-ssl-ttlrecall.sh`

---

## 📱 **SHARING WITH FRIENDS**

### **Multiplayer VR:**
1. Host game on server with HTTPS
2. Share URL with friends
3. Each player enters VR on their Quest
4. Play together in same virtual space!

### **Spectator Mode:**
- Non-VR players can watch on desktop
- Screen mirroring to TV/monitor
- Quest casting to phone/tablet

---

## 🎯 **TIPS FOR BEST EXPERIENCE**

✅ **Clear play area** - Remove obstacles  
✅ **Good lighting** - For hand tracking  
✅ **Stable WiFi** - 5GHz recommended  
✅ **Fully charged** - Quest battery lasts ~2 hours  
✅ **Take breaks** - Every 30 minutes  
✅ **Adjust headset** - For comfort and clarity  

---

## 🆘 **SUPPORT**

Having issues? Check:
- Quest firmware version
- Browser version
- Network connection
- Game server status

---

**Enjoy FastTrack in immersive VR! 🎮✨**

*Experience dimensional computing in true 3D space!*

