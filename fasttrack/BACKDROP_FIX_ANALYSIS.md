# Backdrop Element Visibility Issues - Analysis & Fix

## Problem Statement

Backdrop elements from themes are wandering into the board viewing area, making it hard to see the board and causing pegs to disappear. This affects all themes.

## Root Causes Identified

### 1. **Parallax Movement Drift**
**Location:** `themes.js` lines 270-274

```javascript
// Parallax offset based on mouse movement
if (layer.parallaxFactor > 0) {
    mesh.position.x += (-mouseX * layer.parallaxFactor * 50 - mesh.position.x * 0.001);
    mesh.position.z += (-mouseY * layer.parallaxFactor * 30 - mesh.position.z * 0.001);
}
```

**Issue:** Parallax movement can cause backdrop elements to drift toward the board center (0,0,0) over time, especially with accumulated mouse movements.

### 2. **Depth Write Disabled**
**Location:** `themes.js` line 239

```javascript
m.depthWrite = false;
```

**Issue:** Disabling depth write can cause z-fighting and incorrect rendering order, making backdrop elements appear in front of the board/pegs even though renderOrder is set correctly.

### 3. **No Position Constraints**
**Issue:** Backdrop elements have no boundaries preventing them from entering the board viewing area. The board occupies roughly:
- X: -250 to +250
- Y: -50 to +100
- Z: -250 to +250

Backdrop elements should stay well outside this zone.

### 4. **Render Order Conflicts**
**Location:** `themes.js` lines 231-244

While renderOrder is set to -1 for backdrops, the combination with `depthWrite = false` can still cause issues.

## Recommended Fixes

### Fix 1: Add Position Constraints to Parallax Movement

```javascript
// Parallax offset with boundaries
if (layer.parallaxFactor > 0) {
    const maxDrift = layer.maxDrift || 200; // Maximum distance from origin
    const targetX = -mouseX * layer.parallaxFactor * 50;
    const targetZ = -mouseY * layer.parallaxFactor * 30;
    
    // Clamp to prevent drifting into board area
    const clampedX = Math.max(-maxDrift, Math.min(maxDrift, mesh.position.x + (targetX - mesh.position.x) * 0.001));
    const clampedZ = Math.max(-maxDrift, Math.min(maxDrift, mesh.position.z + (targetZ - mesh.position.z) * 0.001));
    
    mesh.position.x = clampedX;
    mesh.position.z = clampedZ;
}
```

### Fix 2: Keep Depth Write Enabled for Proper Z-Ordering

```javascript
// Remove or comment out:
// m.depthWrite = false;

// Instead, ensure proper positioning and renderOrder only
```

### Fix 3: Add Minimum Distance Constraint

```javascript
// After setting renderOrder, add distance check
this._sceneObjects.forEach(obj => {
    obj.renderOrder = -1;
    
    // Ensure backdrop stays far from board center
    const minDistance = 400; // Minimum distance from origin
    const currentDist = Math.sqrt(obj.position.x ** 2 + obj.position.z ** 2);
    
    if (currentDist < minDistance && currentDist > 0) {
        const scale = minDistance / currentDist;
        obj.position.x *= scale;
        obj.position.z *= scale;
    }
    
    // ... rest of traverse code
});
```

### Fix 4: Add Board-Relative Positioning

For elements that should orbit or surround the board:

```javascript
// Position relative to board boundary, not origin
const BOARD_RADIUS = 250;
const SAFE_MARGIN = 200;
const backdropRadius = BOARD_RADIUS + SAFE_MARGIN; // 450

// Example for circular backdrop elements
const angle = Math.PI * 2 * (index / totalElements);
element.position.x = Math.cos(angle) * backdropRadius;
element.position.z = Math.sin(angle) * backdropRadius;
```

## Implementation Plan

1. **Modify parallax update function** to include position clamping
2. **Remove `depthWrite = false`** to fix z-fighting
3. **Add minimum distance enforcement** when creating backdrop elements
4. **Test across all themes** to ensure fix works universally

## Affected Themes

All themes use the same backdrop system, so this fix will apply to:
- Cosmic (default)
- Space Ace
- Colosseum
- Undersea
- High Contrast
- Fibonacci

## Expected Results

After fix:
- ✅ Backdrop elements stay outside board viewing area
- ✅ No z-fighting or rendering order issues
- ✅ Pegs always visible
- ✅ Board always clearly visible
- ✅ Parallax still works but constrained
- ✅ Consistent behavior across all themes
