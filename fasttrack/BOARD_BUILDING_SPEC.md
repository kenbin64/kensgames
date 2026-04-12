# Fastrack! Board - Building Document

## ButterflyFX Manifold Substrate Implementation

**Version:** 2.0.0  
**Date:** 2026-02-19  
**Framework:** ButterflyFX Dimensional Substrate  
**Game Name:** Fastrack! (play on words: "Fast Track" → "Fastrack!")  
**Design System:** Golden Ratio (φ = 1.618...)

---

## Abstract

This document provides the complete specification for building the Fast Track 3D game board as a ButterflyFX manifold substrate. Every element (board, borders, holes, pegs) is a dimensional object with identity, context, and relationships. The board follows the **identity-first paradigm**: each hole knows its type, each peg knows its location, and game logic traverses relationships rather than iterating positions.

---

## 1. GOLDEN RATIO FOUNDATION (φ = 1.618033988749895)

All board dimensions use the golden ratio for aesthetic harmony. Dimensions cascade from a base unit:

```
φ (PHI) = 1.618033988749895
BASE_UNIT = 5

Golden Cascade:
- Level 1: 5 × φ = 8   → HOLE_RADIUS, CENTER_HOLE_RADIUS
- Level 2: 8 × φ = 13  → RING_WIDTH, DIAMOND_SIZE, LINE_HEIGHT, BORDER_WIDTH
- Level 3: 13 × φ = 21 → PENTAGON_SIZE, BOARD_THICKNESS, HOLDING_HOLE_SPACING
- Level 4: 21 × φ = 34 → HOLDING_CIRCLE_RADIUS, PEG_HEIGHT
```

---

## 2. BOARD GEOMETRY

### 2.1 Hexagon Board

The game board is a **flat-top hexagon** (vertices at top/bottom, flat edges on sides).

```
Constants (Golden Ratio):
- BOARD_RADIUS = 300 (anchor point)
- BOARD_THICKNESS = 21 (Level 3)
- Start angle = -30° (first vertex at -30°, then every 60°)
```

**Vertex Calculation:**
```javascript
for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI / 3) - Math.PI / 6;  // -30°, 30°, 90°, 150°, 210°, 270°
    const x = Math.cos(angle) * BOARD_RADIUS;
    const z = Math.sin(angle) * BOARD_RADIUS;
}
```

**Material:**
- Base: Wood-like texture, color `#d4a574`
- Roughness: 0.7, Metalness: 0.1

### 2.2 Key Radii (Golden Ratio Derived)

| Name | Formula | Value | Purpose |
|------|---------|-------|---------|
| `outerRadius` | BOARD_RADIUS × cos(30°) | ~259.8 | Inscribed circle (geometric) |
| `innerRadius` | outerRadius / φ² | ~99 | Inner circle (golden ratio) |
| `innerHexRadius` | innerRadius / cos(30°) | ~114 | Inner hexagon vertex distance |
| `wedgeFactor` | 1/φ | ~0.618 | Golden narrowing for outer edge |

---

## 3. BORDER SEGMENTS

Six colored border segments along each hexagon edge. Each segment belongs to a player.

### 3.1 Player Colors (Golden Ratio Color Wheel)

Colors spaced by golden angle (~137.5°) for maximum visual distinction.

| Index | Color Name | Hex | Hue |
|-------|------------|-----|-----|
| 0 | Red | #ff0000 | 0° |
| 1 | Teal | #00ff4a | 137.5° |
| 2 | Violet | #9400ff | 275° |
| 3 | Gold | #ffdf00 | 52.5° |
| 4 | Azure | #00d4ff | 190° |
| 5 | Pink | #ff008a | 327.5° |

### 2.2 Border Construction

```javascript
const borderWidth = 15;
const borderHeight = BOARD_THICKNESS + 6;  // 22

for (let i = 0; i < 6; i++) {
    // Edge endpoints
    const angle1 = (i * Math.PI / 3) - Math.PI / 6;
    const angle2 = ((i + 1) * Math.PI / 3) - Math.PI / 6;
    
    // Midpoint and angle
    const midX = (x1 + x2) / 2;
    const midZ = (z1 + z2) / 2;
    const edgeAngle = Math.atan2(z2 - z1, x2 - x1);
    
    // BoxGeometry(length + 12, borderHeight, borderWidth)
    // Position: (midX, 5, midZ), Rotation: -edgeAngle on Y
}
```

---

## 4. HOLE TYPES & POSITIONS

### 3.1 Hole Type Definitions

| Type | ID Format | Count | Description |
|------|-----------|-------|-------------|
| `fasttrack` | `ft-{playerIndex}` | 6 | Inner hexagon corners, pentagon markers |
| `center` | `center` | 1 | Bullseye center |
| `outer` | `outer-{playerIndex}-{0-4}` | 30 | Outer row (5 per wedge) |
| `home` | `home-{playerIndex}` | 6 | Rightmost outer hole with diamond (subset of outer) |
| `side-left` | `side-left-{playerIndex}-{1-4}` | 24 | Left side connecting holes |
| `side-right` | `side-right-{playerIndex}-{1-4}` | 24 | Right side connecting holes |
| `safezone` | `safe-{playerIndex}-{1-4}` | 24 | Safe zone column |
| `holding` | `hold-{playerIndex}-{0-3}` | 24 | Holding area 2×2 grid |

**Total: 133 holes**

### 3.2 Fast Track Holes (Pentagon Markers)

Located at inner hexagon corners. Colored pentagon marker with hole cut in center.

```javascript
const PENTAGON_SIZE = 18;
const HOLE_RADIUS = 6;

for (let i = 0; i < 6; i++) {
    const cornerAngle = (i * Math.PI / 3) - Math.PI / 6;
    
    // Pentagon base distance from center
    const baseDistance = PENTAGON_SIZE * Math.cos(Math.PI / 5);  // ~14.5
    const pentCenterRadius = innerRadius + baseDistance;
    
    const x = Math.cos(cornerAngle) * pentCenterRadius;
    const z = Math.sin(cornerAngle) * pentCenterRadius;
    
    // Pentagon: 5 vertices, point faces outward
    // Rotation: -cornerAngle + π/2 around Z axis (after X rotation)
}
```

### 3.3 Center Hole (Bullseye)

```javascript
const centerHoleRadius = 8;
const ringWidth = 10;

// 6 rings from outside in, each ring colored by player index
for (let r = 5; r >= 0; r--) {
    const outerR = centerHoleRadius + ringWidth * (r + 1);  // 68, 58, 48, 38, 28, 18
    const innerR = centerHoleRadius + ringWidth * r;        // 58, 48, 38, 28, 18, 8
}
```

### 3.4 Outer Track Holes (5 per Wedge)

```javascript
const TRACK_HOLE_RADIUS = 6;

for (let i = 0; i < 6; i++) {
    // Get fast track hole positions (inner hexagon corners)
    const ftX1 = Math.cos(cornerAngle1) * innerHexRadius;
    const ftZ1 = Math.sin(cornerAngle1) * innerHexRadius;
    
    // Outer edge with wedge narrowing
    const outerAngle1 = midAngle - (halfSpan * wedgeFactor);
    const outerAngle2 = midAngle + (halfSpan * wedgeFactor);
    
    const ox1 = Math.cos(outerAngle1) * outerRadius;
    const oz1 = Math.sin(outerAngle1) * outerRadius;
    const ox2 = Math.cos(outerAngle2) * outerRadius;
    const oz2 = Math.sin(outerAngle2) * outerRadius;
    
    // Spacing calculation
    const dist1 = distance(ox1, oz1, ftX1, ftZ1);
    const sideSpacing = dist1 / 5;
    
    // Center 5 holes along outer edge
    const totalOuterSpan = sideSpacing * 4;
    const outerOffset = (outerLength - totalOuterSpan) / 2;
    
    // Place holes with uniform spacing
    for (let h = 0; h < 5; h++) {
        // Position: startX + outerDir * (h * sideSpacing)
    }
}
```

### 3.5 Home/Winner Holes

The **rightmost hole (index 4)** in each player's outer row is the home/winner hole. Marked with a colored diamond shape.

```javascript
const DIAMOND_SIZE = 12;
// Diamond with hole cut in center at outer hole position [4]
```

### 3.6 Side Connecting Holes (4 per side × 2 sides)

```javascript
// Left side: from fast track hole i to first outer hole
for (let h = 1; h <= 4; h++) {
    const t = h / 5;  // t = 0.2, 0.4, 0.6, 0.8
    const x = ftX1 + (outerHole1X - ftX1) * t;
    const z = ftZ1 + (outerHole1Z - ftZ1) * t;
}

// Right side: from NEXT fast track hole to last outer hole
// (same formula, different endpoints)
```

### 3.7 Safe Zone Holes (4 per wedge)

Aligned with wedge centerline, using same t=h/5 interpolation as side holes for consistent radial alignment.

```javascript
// Start from center outer hole (index 2)
const centerOuterX = startX + outerDirX * (2 * sideSpacing);
const centerOuterZ = startZ + outerDirZ * (2 * sideSpacing);

// Target point at inner hexagon along wedge midline
const wedgeMidAngle = (cornerAngle1 + cornerAngle2) / 2;
const innerTargetX = Math.cos(wedgeMidAngle) * innerHexRadius;
const innerTargetZ = Math.sin(wedgeMidAngle) * innerHexRadius;

// 4 holes using same t = h/5 interpolation as side holes
for (let h = 1; h <= 4; h++) {
    const t = h / 5;  // t = 0.2, 0.4, 0.6, 0.8
    const x = centerOuterX + (innerTargetX - centerOuterX) * t;
    const z = centerOuterZ + (innerTargetZ - centerOuterZ) * t;
}
```

#### Safe Zone Enclosure

A colored rectangle surrounds each player's 4 safe zone holes:

```javascript
// Calculate enclosure dimensions
const safeCenterX = (safeHole1X + safeHole4X) / 2;
const safeCenterZ = (safeHole1Z + safeHole4Z) / 2;
const safeZoneLength = distance(safeHole1, safeHole4);
const safeZoneWidth = TRACK_HOLE_RADIUS * 3;

// Simple colored plane with player color
const safePlaneMat = new THREE.MeshBasicMaterial({
    color: COLORS[playerIndex],
    transparent: true,
    opacity: 0.6
});

// Rotate to align with wedge direction
stadiumMesh.rotation.z = -wedgeMidAngle + Math.PI / 2;
```

### 3.8 Holding Area Holes (2×2 Grid)

```javascript
const HOLDING_CIRCLE_RADIUS = 20;
const HOLDING_HOLE_SPACING = 14;

// Position: 78% of BOARD_RADIUS, 15% from right edge of wedge
const holdingAngle = angle2 - (angle2 - angle1) * 0.15;
const holdingRadius = BOARD_RADIUS * 0.78;

// 2×2 grid offsets, rotated to align with radial direction
const offsets = [
    [-7, -7], [7, -7],
    [-7, 7],  [7, 7]
];

// Rotate offsets by holdingAngle
const rotatedX = localX * cos(holdingAngle) - localZ * sin(holdingAngle);
const rotatedZ = localX * sin(holdingAngle) + localZ * cos(holdingAngle);
```

---

## 5. PEGS

### 4.1 Peg Geometry (Light Bright Style)

Tapered cylinder with flat disc top, translucent glowing appearance.

```javascript
const PEG_TOP_RADIUS = 5;
const PEG_BOTTOM_RADIUS = 7;
const PEG_HEIGHT = 35;
const PEG_DISC_RADIUS = 6;
const PEG_DISC_HEIGHT = 3;
const PEG_SEGMENTS = 32;

// Body: CylinderGeometry(topRadius, bottomRadius, height, segments)
// Disc: CylinderGeometry(discRadius, discRadius, discHeight, segments)
```

### 4.2 Peg Material (Translucent Glowing)

```javascript
// Body material - translucent glow
const bodyMaterial = new THREE.MeshStandardMaterial({
    color: PLAYER_COLOR,
    transparent: true,
    opacity: 0.85,
    roughness: 0.3,
    metalness: 0.2,
    emissive: PLAYER_COLOR,
    emissiveIntensity: 0.3
});

// Disc material - same color, flat top
const discMaterial = new THREE.MeshStandardMaterial({
    color: PLAYER_COLOR,
    roughness: 0.4,
    metalness: 0.3
});
```

### 4.3 Starting Positions

For each player:
- **4 pegs** in holding area (holes 0-3)
- **1 peg** in home/winner hole

---

## 6. BRANDING

### 5.1 Branding Circle

Text "★ Fastrack!" repeated around the divider circle between bullseye and pentagons.

```javascript
const brandText = "★ Fastrack! ★ Fastrack! ★ Fastrack! ★ Fastrack! ";
const textRadius = dividerRadius;  // ~120

// Canvas-based texture
ctx.font = 'bold 64px "Segoe UI", Arial, sans-serif';

// Gradient: gold to orange
const gradient = ctx.createLinearGradient(-size/2, 0, size/2, 0);
gradient.addColorStop(0, '#FFD700');
gradient.addColorStop(0.5, '#FFA500');
gradient.addColorStop(1, '#FFD700');

// Text orientation: clockwise, bottoms face center
for (let i = 0; i < brandText.length; i++) {
    const angle = (Math.PI / 2) - i * anglePerChar;  // Start at top, go clockwise
    ctx.rotate(angle);
    ctx.translate(0, textRadius);
    // Draw character
}
```

---

## 7. DATA STRUCTURES

### 5.1 Hole Object (Manifold Substrate)

```javascript
{
    id: "ft-0",                    // Unique identifier
    type: "fasttrack",             // Hole category
    playerIndex: 0,                // Owning player (0-5)
    position: { x: 114.5, y: 10, z: 0 },
    radius: 6,
    occupied: false,               // Current state
    occupiedBy: null,              // Peg ID if occupied
    connections: ["side-left-0-1", "side-right-5-1"],  // Adjacent holes
    marker: "pentagon"             // Visual marker type
}
```

### 5.2 Peg Object (Manifold Substrate)

```javascript
{
    id: "peg-0-1",                 // Player 0, peg index 1
    playerIndex: 0,
    color: 0xff6600,
    currentHole: "hold-0-1",       // Current location
    position: { x: 0, y: 0, z: 0 }, // 3D position
    mesh: THREE.Mesh               // Three.js object reference
}
```

### 5.3 Game State

```javascript
{
    turn: 0,                       // Current player's turn
    phase: "draw",                 // Game phase
    holes: Map<id, HoleObject>,
    pegs: Map<id, PegObject>,
    players: [
        { index: 0, pegsHome: 0, pegsOnTrack: 1, pegsInHolding: 4 }
    ]
}
```

---

## 8. ADJACENCY & MOVEMENT RULES

### 7.1 Track Adjacency

```
Fast Track Hole → Side Left Holes (1-4) → Outer Row (0-4)
                                       ↓
Fast Track Hole ← Side Right Holes (1-4) ←┘
        ↓
    Safe Zone (1-4)
        ↓
    Center Hole
```

### 7.2 Movement Paths

1. **Exit holding**: Holding → Fast Track (card draw required)
2. **Track traversal**: Fast Track → Side → Outer → Side → Fast Track (clockwise)
3. **Enter safe zone**: From own fast track hole → Safe Zone holes
4. **Win**: Traverse safe zone → Home/Winner hole

---

## 8. RECONSTRUCTION ALGORITHM

To rebuild the board from scratch:

```
1. Create hexagon board (BOARD_RADIUS=300, THICKNESS=16)
2. Create 6 border segments with player colors
3. Create 6 fast track holes with pentagon markers
4. Create center bullseye with 6 colored rings
5. For each player (0-5):
   a. Calculate wedge geometry (outerAngle1, outerAngle2)
   b. Calculate sideSpacing = distance(fastTrack, outerCorner) / 5
   c. Create 5 outer holes (centered, with sideSpacing)
   d. Create diamond marker at hole 4 (home)
   e. Create 4 side-left holes (interpolate 0.2, 0.4, 0.6, 0.8)
   f. Create 4 side-right holes (same interpolation, next corner)
   g. Create 4 safe zone holes (perpendicular from center outer)
   h. Create holding area circle + 4 holes in 2×2 grid
6. Register all holes in game state
7. Create 5 pegs per player
8. Place 4 pegs in holding, 1 in home
```

---

## 8. COORDINATE SYSTEM

```
        +Y (up)
         |
         |
         |_______ +X (right)
        /
       /
      +Z (toward viewer)

Camera default: (0, 500, 400) looking at origin
Board lies in XZ plane with Y as height
```

---

## 9. MATERIAL SPECIFICATIONS

### 9.1 Board Materials

| Element | Color | Roughness | Metalness | Emissive |
|---------|-------|-----------|-----------|----------|
| Board | #d4a574 | 0.7 | 0.1 | None |
| Borders | Player color | 0.2 | 0.7 | 0.2 intensity |
| Pentagons | Player color | 0.2 | 0.7 | 0.15 intensity |
| Diamonds | Player color | 0.2 | 0.7 | 0.15 intensity |
| Rings | Player color | 0.2 | 0.7 | None |
| Holding circles | Player color | 0.2 | 0.7 | None |
| Holes | #222222 | 0.8 | 0.0 | None |

### 9.2 Peg Materials

| Property | Value |
|----------|-------|
| Color | Player color |
| Roughness | 0.15 |
| Metalness | 0.9 |
| Emissive | Player color |
| Emissive Intensity | 0.2 |

---

## 10. LIGHTING SETUP

```javascript
// Ambient light (global illumination)
AmbientLight(0xffffff, 0.5)

// Main directional light (key light)
DirectionalLight(0xffffff, 0.8)
Position: (200, 500, 200)
Shadow: enabled, mapSize 2048×2048

// Fill light (soften shadows)
DirectionalLight(0xffffff, 0.3)
Position: (-200, 300, -200)
```

---

## Appendix A: Formula Reference

| Calculation | Formula |
|-------------|---------|
| Hexagon vertex | `(cos(i×60° - 30°) × R, sin(i×60° - 30°) × R)` |
| Inner radius | `R / 3` |
| Outer radius | `R × cos(30°)` |
| Inner hex radius | `innerRadius / cos(30°)` |
| Pentagon base distance | `PENTAGON_SIZE × cos(36°)` |
| Side spacing | `distance(fastTrack, outerCorner) / 5` |

---

*This document is a ButterflyFX manifold substrate specification. Each element maintains identity and relationships for traversal-based game logic.*
